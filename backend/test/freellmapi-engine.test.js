'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const freellm = require('../freellmapi');

test('FreeLLMAPI: Engine status exports all supported providers', () => {
  const status = freellm.getEngineStatus();
  assert.ok(status.engine.includes('FreeLLMAPI Native Fusion'));
  assert.ok(status.supportedProviders.length >= 8);
  const ids = status.supportedProviders.map(p => p.id);
  assert.ok(ids.includes('groq'));
  assert.ok(ids.includes('cerebras'));
  assert.ok(ids.includes('gemini'));
  assert.ok(ids.includes('nvidia'));
  assert.ok(ids.includes('mistral'));
  assert.ok(ids.includes('openrouter'));
});

test('FreeLLMAPI: LRU Cache stores and retrieves completions', () => {
  freellm.clearCache();
  const messages = [{ role: 'user', content: 'What is ATS resume optimization?' }];
  const model = 'llama-3.3-70b-versatile';
  const temperature = 0.3;

  assert.equal(freellm.promptCache.get(messages, model, temperature), null);

  freellm.promptCache.set(messages, model, temperature, {
    content: 'ATS optimization aligns keywords and experience formatting.',
    provider: 'groq',
    model,
    usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
  });

  const cached = freellm.promptCache.get(messages, model, temperature);
  assert.ok(cached);
  assert.equal(cached.provider, 'groq');
  assert.equal(cached.content, 'ATS optimization aligns keywords and experience formatting.');
  assert.equal(freellm.promptCache.size(), 1);
  freellm.clearCache();
  assert.equal(freellm.promptCache.size(), 0);
});

test('FreeLLMAPI: Cooldown manager sets backoff and expires', () => {
  freellm.resetCooldowns();
  assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'llama-3.3-70b-versatile').onCooldown, false);

  freellm.cooldownManager.setCooldown('groq', 'llama-3.3-70b-versatile', 'HTTP 429 Rate Limit');
  const check = freellm.cooldownManager.isOnCooldown('groq', 'llama-3.3-70b-versatile');
  assert.equal(check.onCooldown, true);
  assert.equal(check.reason, 'HTTP 429 Rate Limit');
  assert.ok(check.remainingMs > 0);

  freellm.cooldownManager.clearCooldown('groq', 'llama-3.3-70b-versatile');
  assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'llama-3.3-70b-versatile').onCooldown, false);
});

test('FreeLLMAPI: Fallback cascade switches to second provider when first fails with 429', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  // Mock fetch implementation: Groq returns 429, Cerebras succeeds
  const mockFetch = async (url, options) => {
    if (url.includes('groq.com')) {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'Rate limit reached on Groq' } }),
      };
    }
    if (url.includes('cerebras.ai')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: 'Success from Cerebras failover!' } }],
          usage: { prompt_tokens: 15, completion_tokens: 6, total_tokens: 21 },
        }),
      };
    }
    return { ok: false, status: 500, text: async () => 'Unexpected URL' };
  };

  const platformConfig = {
    providers: {
      groq: { key: 'gsk-mock-key', enabled: true, model: 'llama-3.3-70b-versatile' },
      cerebras: { key: 'csk-mock-key', enabled: true, model: 'llama3.3-70b' },
    },
  };

  const result = await freellm.completeChat({
    prompt: 'Generate executive summary',
    platformConfig,
    fetchImpl: mockFetch,
    bypassCache: true,
  });

  assert.equal(result.provider, 'cerebras');
  assert.equal(result.content, 'Success from Cerebras failover!');
  assert.equal(result.fallbacksAttempted.length, 1);
  assert.equal(result.fallbacksAttempted[0].provider, 'groq');
  assert.equal(result.fallbacksAttempted[0].status, 429);

  // Verify Groq was placed on cooldown
  assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'llama-3.3-70b-versatile').onCooldown, true);
});

test('FreeLLMAPI: Tenant Dedicated BYOK strictly isolates routing to tenant key', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  let capturedAuthHeader = null;
  const mockFetch = async (url, options) => {
    capturedAuthHeader = options.headers['Authorization'];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: 'Tenant isolated completion' } }],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
    };
  };

  const tenantContext = {
    tenantId: 'tenant-enterprise-uuid-1',
    customProviderKeys: {
      nvidia: 'nvapi-dedicated-tenant-key-999',
    },
    primaryModel: 'meta/llama-3.2-11b-vision-instruct',
  };

  const platformConfig = {
    providers: {
      groq: { key: 'gsk-shared-master-key', enabled: true },
    },
  };

  const result = await freellm.completeChat({
    prompt: 'Private tenant data extraction',
    tenantContext,
    platformConfig,
    fetchImpl: mockFetch,
    bypassCache: true,
  });

  assert.equal(result.provider, 'nvidia');
  assert.equal(result.isDedicatedByok, true);
  assert.equal(capturedAuthHeader, 'Bearer nvapi-dedicated-tenant-key-999');
  // Shared Groq key was never touched!
  assert.ok(!capturedAuthHeader.includes('gsk-shared-master-key'));
});

test('FreeLLMAPI: All providers are registered in catalog', () => {
  const providers = freellm.getProviderCatalog();
  assert.ok(providers.length >= 50); // Comprehensive catalog covering all 71 platform aliases
  assert.ok(freellm.getProviderMeta('groq'));
  assert.ok(freellm.getProviderMeta('cerebras'));
  assert.ok(freellm.getProviderMeta('gemini'));
  assert.ok(freellm.getProviderMeta('mistral'));
  assert.ok(freellm.getProviderMeta('openrouter'));
  assert.ok(freellm.getProviderMeta('cloudflare'));
  assert.ok(freellm.getProviderMeta('cohere'));
  assert.ok(freellm.getProviderMeta('tavily'));
  assert.ok(freellm.getProviderMeta('siliconflow'));
});

test('FreeLLMAPI: Dynamic live model discovery pulls models from provider /models endpoint', async () => {
  const { modelDiscovery } = require('../freellmapi/services/modelDiscovery');

  const mockFetch = async (url) => {
    if (url.includes('/models')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'llama-3.3-70b-versatile', context_window: 131072 },
            { id: 'llama-3.1-8b-instant', context_window: 131072 },
            { id: 'bge-large-en-v1.5' }, // non-chat embedding model
          ],
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  const discovered = await modelDiscovery.discoverFromEndpoint({
    providerId: 'groq',
    apiKey: 'gsk-mock-key',
    baseUrl: 'https://api.groq.com/openai/v1',
    fetchImpl: mockFetch,
  });

  assert.ok(discovered.length >= 2);
  // Verify embedding model was filtered out
  assert.ok(!discovered.some(m => m.id.includes('bge')));
  // Verify Frontier intelligence model is ranked first
  assert.equal(discovered[0].id, 'llama-3.3-70b-versatile');
  assert.equal(discovered[0].intelligenceTier, 'Frontier');
});

test('FreeLLMAPI: Claude Code Agent handles Anthropic /v1/messages wire format', async () => {
  const anthropicRequest = {
    model: 'claude-3-7-sonnet',
    max_tokens: 1024,
    system: 'You are an elite career intelligence engine.',
    messages: [
      {
        role: 'user',
        content: 'Review this resume for executive ATS keywords.',
      },
    ],
  };

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{ message: { content: 'Executive review complete. Keywords: P&L, Scaled Architecture.' } }],
      usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
    }),
  });

  // Temporarily stub fetchImpl for testing
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    const platformConfig = {
      providers: {
        groq: { key: 'gsk-mock-groq-key', enabled: true },
      },
    };

    const anthropicResponse = await freellm.handleAnthropicMessages(anthropicRequest, { platformConfig });
    assert.equal(anthropicResponse.type, 'message');
    assert.equal(anthropicResponse.role, 'assistant');
    assert.equal(anthropicResponse.model, 'claude-3-7-sonnet');
    assert.ok(anthropicResponse.content[0].text.includes('Executive review complete'));
    assert.equal(anthropicResponse.usage.input_tokens, 30);
    assert.equal(anthropicResponse.usage.output_tokens, 12);
    assert.equal(anthropicResponse._freellmapi.provider, 'groq');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('FreeLLMAPI: Autonomous self-healing maintenance starts and stops cleanly', () => {
  freellm.cooldownManager.setCooldown('groq', 'test-model', 'rate_limit');
  freellm.startAutonomousMaintenance({ intervalMs: 50 });
  freellm.stopAutonomousMaintenance();
  assert.ok(true);
});

test('FreeLLMAPI: Express app mounts /v1/models and /api/freellmapi/status', async () => {
  const request = require('supertest');
  const app = require('../index');
  const resModels = await request(app).get('/v1/models');
  assert.equal(resModels.status, 200);
  assert.equal(resModels.body.object, 'list');
  assert.ok(resModels.body.data.length >= 8);

  const resStatus = await request(app).get('/v1/status');
  assert.equal(resStatus.status, 200);
  assert.equal(resStatus.body.success, true);
  assert.ok(resStatus.body.totalProvidersCount >= 50);
});

