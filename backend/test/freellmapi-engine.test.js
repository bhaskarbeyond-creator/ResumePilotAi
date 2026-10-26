'use strict';

// Keep the suite hermetic: the durable metrics store must not write inside the
// repository during tests. Production uses data/freellm_metrics.db.
process.env.FREELMAPI_METRICS_DB = process.env.FREELMAPI_METRICS_DB || ':memory:';
// F-01: anonymous /v1 access is closed by default and requires this explicit
// dev flag. The wire-parity tests below exercise engine behaviour (SSE, tool
// rescue, failover), not authentication posture; they opt into the documented
// local-dev anonymous principal. The closed default is pinned separately in
// test/v1-admission-control.test.js.
process.env.ALLOW_ANON_V1 = 'true';

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
  const mockFetch = async (url, _options) => {
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
      nvidia: 'fixture-nvidia-dedicated-tenant-999',
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
  assert.equal(capturedAuthHeader, 'Bearer fixture-nvidia-dedicated-tenant-999');
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
  // Provider ordering is preserved; model names are not a quality benchmark.
  assert.equal(discovered[0].id, 'llama-3.3-70b-versatile');
  assert.equal(discovered[0].intelligenceTier, 'Unknown');
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

test('FreeLLMAPI: Express app mounts /v1/models and the operator-gated /v1/status', async () => {
  const request = require('supertest');
  const app = require('../index');
  const resModels = await request(app).get('/v1/models');
  assert.equal(resModels.status, 200);
  assert.equal(resModels.body.object, 'list');
  assert.ok(resModels.body.data.length >= 8);

  // F-10: /v1/status was an unauthenticated internals dump (the previous
  // assertion `totalProvidersCount >= 50` pinned exactly the vulnerability the
  // audit flagged). It is now an operator surface (platform key / super admin)
  // with a reduced payload; the anonymous-local dev principal is rejected.
  const anonStatus = await request(app).get('/v1/status');
  assert.equal(anonStatus.status, 403);
  assert.equal(anonStatus.body.error.code, 'status_forbidden');

  process.env.FREELMAPI_API_KEYS = 'ime365-platform-key';
  try {
    const resStatus = await request(app).get('/v1/status').set('Authorization', 'Bearer ime365-platform-key');
    assert.equal(resStatus.status, 200);
    assert.equal(resStatus.body.success, true);
    assert.equal(typeof resStatus.body.version, 'string');
    assert.equal(typeof resStatus.body.providers?.configured, 'number');
    assert.ok(!('totalProvidersCount' in resStatus.body), 'reduced payload carries no engine internals');
    assert.ok(!('activeCooldowns' in resStatus.body));
    assert.ok(!('persistence' in resStatus.body));
  } finally {
    delete process.env.FREELMAPI_API_KEYS;
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// 10/10 PARITY SUITE — streaming, compression, multi-key, isolation, search,
// tool rescue, durable persistence and the public OpenAI/Anthropic wire.
// ═══════════════════════════════════════════════════════════════════════════

const { ReadableStream } = require('node:stream/web');

function sseStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(payload),
  };
}

function completionPayload(content, usage = { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 }) {
  return {
    id: 'chatcmpl-test',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage,
  };
}

test('FreeLLMAPI: streaming generator yields OpenAI-compatible deltas and [DONE]-less finish', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: sseStream([
      'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":" from"}}]}\n\n',
      'data: {"choices":[{"index":0,"delta":{"content":" Groq"},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":3,"total_tokens":12}}\n\n',
      'data: [DONE]\n\n',
    ]),
  });

  const events = [];
  for await (const event of freellm.streamChat({
    messages: [{ role: 'user', content: 'Say hello' }],
    platformConfig: {
      providers: { groq: { key: 'gsk-stream-key', enabled: true, model: 'llama-3.3-70b-versatile' } },
      enableFallback: false,
    },
    fetchImpl: mockFetch,
  })) events.push(event);

  const meta = events.find(event => event.type === 'meta');
  assert.ok(meta, 'stream must announce the serving provider');
  assert.equal(meta.provider, 'groq');

  const text = events.filter(event => event.type === 'text').map(event => event.text).join('');
  assert.equal(text, 'Hello from Groq');

  const finish = events.find(event => event.type === 'finish');
  assert.equal(finish.finishReason, 'stop');
  assert.equal(finish.usage.totalTokens, 12);
});

test('FreeLLMAPI: streaming fails over to the next provider before the first token', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    if (url.includes('groq.com')) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: { message: 'rate limited' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: sseStream([
        'data: {"choices":[{"index":0,"delta":{"content":"Cerebras"}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"content":" wins"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    };
  };

  const events = [];
  for await (const event of freellm.streamChat({
    messages: [{ role: 'user', content: 'failover please' }],
    platformConfig: {
      providers: {
        groq: { key: 'gsk-valid-fixture-a', enabled: true, model: 'llama-3.3-70b-versatile' },
        cerebras: { key: 'csk-valid-fixture-b', enabled: true, model: 'llama3.3-70b' },
      },
    },
    fetchImpl: mockFetch,
  })) events.push(event);

  const text = events.filter(event => event.type === 'text').map(event => event.text).join('');
  assert.equal(text, 'Cerebras wins');
  assert.equal(events.find(event => event.type === 'meta').provider, 'cerebras');
  assert.ok(calls.some(url => url.includes('groq.com')));
  assert.ok(calls.some(url => url.includes('cerebras.ai')));
});

test('FreeLLMAPI: compression pipeline reduces prompt tokens without breaking JSON', () => {
  freellm.clearCache();
  const rows = Array.from({ length: 12 }, (_unused, index) => ({
    company: `Company ${index}`,
    role: 'Senior Engineer',
    location: 'Hyderabad',
    years: index,
  }));
  const prompt = `Analyse this pipeline:\n${JSON.stringify(rows, null, 2)}\n\nReturn a summary.`;

  const result = freellm.compressMessages([
    { role: 'system', content: 'You are an ATS analyst.' },
    { role: 'user', content: prompt },
  ], { targetTokens: 120 });

  assert.equal(result.stats.enabled, true);
  assert.ok(result.stats.afterTokens < result.stats.beforeTokens, 'tokens must shrink');
  assert.ok(result.stats.tokensSaved >= 20);
  assert.ok(result.stats.engines.jsoncompact.applied);

  // The table dialect round-trips back into the exact original array.
  const marker = /\[\[json-table:v1 columns=(\[[^\n]+\]) rows=(\d+)\]\]\n([\s\S]*?)\n\[\[\/json-table\]\]/;
  const match = marker.exec(result.messages[1].content);
  assert.ok(match, 'uniform rows must be encoded as a json-table');
  const { decodeJsonTables } = require('../freellmapi/services/compression');
  const decoded = decodeJsonTables(match[0]);
  assert.deepEqual(JSON.parse(decoded), rows);
});

test('FreeLLMAPI: compression is skipped on request when disabled', () => {
  const messages = [{ role: 'user', content: 'x'.repeat(5000) }];
  const result = freellm.compressMessages(messages, { enabled: false });
  assert.equal(result.stats.enabled, false);
  assert.equal(result.messages[0].content.length, 5000);
});

test('FreeLLMAPI: multi-key pool rotates to the next key on 429 before benching the provider', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  const seenKeys = [];
  const mockFetch = async (_url, options) => {
    const auth = options.headers.Authorization || '';
    seenKeys.push(auth);
    if (auth.includes('gsk-first')) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: { message: 'rate limited key 1' } }),
      };
    }
    return jsonResponse(completionPayload('served by pooled key 2'));
  };

  const platformConfig = {
    providers: {
      groq: {
        key: ['gsk-first-key-0001', 'gsk-second-key-0002'],
        enabled: true,
        model: 'llama-3.3-70b-versatile',
      },
    },
    enableFallback: false,
  };

  const result = await freellm.completeChat({
    prompt: 'Use the second key',
    platformConfig,
    fetchImpl: mockFetch,
    bypassCache: true,
  });

  assert.equal(result.content, 'served by pooled key 2');
  assert.equal(result.provider, 'groq');
  assert.equal(result.keysAttempted, 2);
  assert.deepEqual(seenKeys, ['Bearer gsk-first-key-0001', 'Bearer gsk-second-key-0002']);
  // Success on key 2 clears the provider: no cooldown from one throttled key.
  assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'llama-3.3-70b-versatile').onCooldown, false);

  // Round-robin: the next request starts from key 2.
  seenKeys.length = 0;
  await freellm.completeChat({ prompt: 'second request', platformConfig, fetchImpl: mockFetch, bypassCache: true });
  assert.deepEqual(seenKeys, ['Bearer gsk-second-key-0002']);
});

test('FreeLLMAPI: a provider is benched only after every pooled key is rate-limited', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  const attempts = [];
  const mockFetch = async (_url, options) => {
    attempts.push(options.headers.Authorization);
    return {
      ok: false,
      status: 429,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ error: { message: 'quota exhausted' } }),
    };
  };

  await assert.rejects(() => freellm.completeChat({
    prompt: 'all keys throttled',
    platformConfig: {
      providers: {
        groq: { key: ['gsk-one-0001', 'gsk-two-0002', 'gsk-three-0003'], enabled: true, model: 'llama-3.3-70b-versatile' },
      },
      enableFallback: false,
    },
    fetchImpl: mockFetch,
    bypassCache: true,
  }), /All AI providers failed/);

  assert.equal(attempts.length, 3, 'every pooled key must be tried before benching');
  assert.equal(freellm.cooldownManager.isOnCooldown('groq', 'llama-3.3-70b-versatile').onCooldown, true);
});

test('FreeLLMAPI: search and media providers are excluded from the chat cascade', async () => {
  freellm.resetCooldowns();
  const candidates = await freellm.freeLlmRouter.buildCandidateList({
    platformConfig: {
      providers: {
        tavily: { key: 'tvly-key', enabled: true, model: 'search' },
        exa: { key: 'exa-key', enabled: true, model: 'search' },
        speechify: { key: 'speech-key', enabled: true, model: 'tts' },
        groq: { key: 'gsk-chat-key', enabled: true, model: 'llama-3.3-70b-versatile' },
      },
    },
    fetchImpl: async () => jsonResponse({}),
  });

  const ids = candidates.map(candidate => candidate.provider);
  assert.deepEqual(ids, ['groq']);
  assert.ok(!ids.includes('tavily'));
  assert.ok(!ids.includes('exa'));
  assert.ok(!ids.includes('speechify'));
});

test('FreeLLMAPI: search cascade calls Tavily /search (never /chat/completions) and falls back on 429', async () => {
  freellm.resetCooldowns();
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    if (url.includes('api.tavily.com')) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ detail: { error: 'rate limit' } }),
      };
    }
    if (url.includes('api.exa.ai')) {
      return jsonResponse({
        results: [
          { title: 'Interview coaching &amp; prep', url: 'https://example.com/a', text: 'Star method guidance' },
          { title: 'ATS optimisation', url: 'https://example.com/b', summary: 'Keyword alignment' },
        ],
      });
    }
    return jsonResponse({}, 404);
  };

  const result = await freellm.searchWeb({
    query: 'resume ats optimisation',
    platformConfig: {
      providers: {
        tavily: { key: 'tvly-key-0001', enabled: true },
        exa: { key: 'exa-key-0001', enabled: true },
      },
    },
    fetchImpl: mockFetch,
  });

  assert.equal(result.provider, 'exa');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].title, 'Interview coaching & prep');
  assert.ok(calls.every(url => !url.includes('/chat/completions')));
  assert.ok(calls.some(url => url === 'https://api.tavily.com/search'));
  assert.ok(calls.some(url => url === 'https://api.exa.ai/search'));
  assert.equal(result.fallbacks.length, 1);
  assert.equal(result.fallbacks[0].provider, 'tavily');
});

test('FreeLLMAPI: plaintext tool-call dialects are rescued into structured tool_calls', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  const mockFetch = async () => jsonResponse(completionPayload(
    '```json\n{"name": "saveResume", "arguments": {"title": "Executive CV"}}\n```',
  ));

  const result = await freellm.completeChat({
    messages: [{ role: 'user', content: 'Save my resume' }],
    tools: [{
      type: 'function',
      function: { name: 'saveResume', parameters: { type: 'object', properties: { title: { type: 'string' } } } },
    }],
    platformConfig: {
      providers: { groq: { key: 'gsk-tools-0001', enabled: true, model: 'llama-3.3-70b-versatile' } },
      enableFallback: false,
    },
    fetchImpl: mockFetch,
    bypassCache: true,
  });

  assert.equal(result.toolCallsRescued, true);
  assert.equal(result.finishReason, 'tool_calls');
  assert.equal(result.toolCalls[0].function.name, 'saveResume');
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), { title: 'Executive CV' });
  assert.equal(result.content, '');
});

test('FreeLLMAPI: an unparseable tool dialect is a dead turn, not prose', async () => {
  freellm.resetCooldowns();
  freellm.clearCache();

  const mockFetch = async () => jsonResponse(completionPayload('<function=unknownTool{"x":1}</function>'));

  await assert.rejects(() => freellm.completeChat({
    messages: [{ role: 'user', content: 'call the tool' }],
    tools: [{ type: 'function', function: { name: 'saveResume', parameters: { type: 'object', properties: {} } } }],
    platformConfig: {
      providers: { groq: { key: 'gsk-tools-0002', enabled: true, model: 'llama-3.3-70b-versatile' } },
      enableFallback: false,
    },
    fetchImpl: mockFetch,
    bypassCache: true,
  }), /All AI providers failed/);
});

test('FreeLLMAPI: durable metrics + cooldowns persist to node:sqlite and hydrate across restarts', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { MetricsPersistence } = require('../freellmapi/services/persistence');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freellm-metrics-'));
  const dbPath = path.join(dir, 'freellm_metrics.db');

  const first = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: dbPath } });
  assert.equal(first.backend, 'sqlite', 'node:sqlite must be the durable backend');
  first.recordRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile', ok: true, latencyMs: 120, status: 200 });
  first.recordRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile', ok: false, latencyMs: 480, status: 429 });
  first.recordCooldown({ provider: 'groq', model: 'llama-3.3-70b-versatile', expiresAt: Date.now() + 60_000, reason: '429', strikes: 1 });
  const summary = first.getSummary();
  assert.equal(summary.requests, 2);
  assert.equal(summary.failures, 1);
  assert.equal(summary.activeCooldowns, 1);
  assert.equal(first.getProviderMetrics()[0].lastStatus, 429);
  first.close();

  // A fresh instance is the "process restart": cooldown + counters survive.
  const second = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: dbPath } });
  assert.equal(second.getSummary().requests, 2);
  assert.equal(second.loadCooldowns().length, 1);
  second.reset();
  assert.equal(second.getSummary().requests, 0);
  second.close();

  const { CooldownManager } = require('../freellmapi/services/cooldown');
  const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: dbPath } });
  store.recordCooldown({ provider: 'cerebras', model: 'llama3.3-70b', expiresAt: Date.now() + 30_000, reason: 'persisted', strikes: 2 });
  const manager = new CooldownManager();
  const hydrated = manager.attachPersistence(store);
  assert.equal(hydrated.hydrated, 1);
  assert.equal(manager.isOnCooldown('cerebras', 'llama3.3-70b').onCooldown, true);
  store.reset();
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('FreeLLMAPI: persistence falls back to memory when node:sqlite is disabled', () => {
  const { MetricsPersistence } = require('../freellmapi/services/persistence');
  const store = new MetricsPersistence({ environment: { FREELMAPI_METRICS_DB: ':memory:' } });
  assert.equal(store.backend, 'memory');
  store.recordRequest({ provider: 'gemini', model: 'gemini-2.0-flash', ok: true, latencyMs: 90, status: 200 });
  assert.equal(store.getSummary().requests, 1);
  store.close();
});

test('FreeLLMAPI: POST /v1/chat/completions returns an OpenAI-shaped completion', async () => {
  const request = require('supertest');
  const { loadFreeLlmPlatformConfig, clearFreeLlmConfigCache } = require('../services/freellmConfig');
  const app = require('../index');

  process.env.GROQ_API_KEY = 'gsk-http-key-0001';
  process.env.FREELMAPI_API_KEYS = 'ime365-platform-key';
  clearFreeLlmConfigCache();
  freellm.resetCooldowns();
  freellm.clearCache();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return jsonResponse({ data: [{ id: 'llama-3.3-70b-versatile' }] });
    return jsonResponse(completionPayload('OpenAI-compatible body', { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }));
  };

  try {
    const config = await loadFreeLlmPlatformConfig({ environment: process.env, bypassCache: true });
    assert.ok(config.providers.groq, 'env key must surface as a configured provider');

    const res = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer ime365-platform-key')
      .send({ model: 'auto', messages: [{ role: 'user', content: 'Hello' }], temperature: 0.2 });

    assert.equal(res.status, 200);
    assert.equal(res.body.object, 'chat.completion');
    assert.match(res.body.id, /^chatcmpl-/);
    assert.equal(res.body.choices[0].message.role, 'assistant');
    assert.equal(res.body.choices[0].message.content, 'OpenAI-compatible body');
    assert.equal(res.body.choices[0].finish_reason, 'stop');
    assert.equal(res.body.usage.total_tokens, 16);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.FREELMAPI_API_KEYS;
    clearFreeLlmConfigCache();
  }
});

test('FreeLLMAPI: POST /v1/chat/completions rejects bad and missing credentials', async () => {
  const request = require('supertest');
  const { clearFreeLlmConfigCache } = require('../services/freellmConfig');
  const app = require('../index');

  process.env.FREELMAPI_API_KEYS = 'ime365-platform-key';
  clearFreeLlmConfigCache();
  try {
    const bad = await request(app)
      .post('/v1/chat/completions')
      .set('Authorization', 'Bearer not-the-key')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, 'invalid_api_key');

    const missing = await request(app)
      .post('/v1/chat/completions')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error.code, 'missing_api_key');
  } finally {
    delete process.env.FREELMAPI_API_KEYS;
    clearFreeLlmConfigCache();
  }
});

test('FreeLLMAPI: POST /v1/chat/completions streams text/event-stream chunks', async () => {
  const request = require('supertest');
  const { clearFreeLlmConfigCache } = require('../services/freellmConfig');
  const app = require('../index');

  process.env.GROQ_API_KEY = 'gsk-http-stream-0001';
  clearFreeLlmConfigCache();
  freellm.resetCooldowns();
  freellm.clearCache();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return jsonResponse({ data: [{ id: 'llama-3.3-70b-versatile' }] });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: sseStream([
        'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"Streamed"}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{"content":" hello"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    };
  };

  try {
    const res = await request(app)
      .post('/v1/chat/completions')
      .send({ model: 'auto', stream: true, messages: [{ role: 'user', content: 'stream it' }] });

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/event-stream/);
    assert.match(res.headers['cache-control'], /no-cache/);
    assert.equal(res.headers['x-accel-buffering'], 'no');
    const lines = String(res.text).split('\n').filter(line => line.startsWith('data: '));
    assert.ok(lines.some(line => line.includes('chat.completion.chunk')));
    assert.ok(lines.some(line => line.includes('"content":"Streamed"')));
    assert.ok(lines.some(line => line.includes('"content":" hello"')));
    assert.ok(lines.some(line => line.includes('"finish_reason":"stop"')));
    assert.equal(lines[lines.length - 1], 'data: [DONE]');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    clearFreeLlmConfigCache();
  }
});

test('FreeLLMAPI: POST /v1/messages handles Anthropic format and SSE streaming', async () => {
  const request = require('supertest');
  const { clearFreeLlmConfigCache } = require('../services/freellmConfig');
  const app = require('../index');

  process.env.GROQ_API_KEY = 'gsk-anthropic-key-0001';
  clearFreeLlmConfigCache();
  freellm.resetCooldowns();
  freellm.clearCache();

  const originalFetch = globalThis.fetch;
  let serveStream = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return jsonResponse({ data: [{ id: 'llama-3.3-70b-versatile' }] });
    if (serveStream) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/event-stream' },
        body: sseStream([
          'data: {"choices":[{"index":0,"delta":{"content":"Anthropic"}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{"content":" stream"},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      };
    }
    return jsonResponse(completionPayload('Anthropic blocking body', { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 }));
  };

  try {
    const blocking = await request(app)
      .post('/v1/messages')
      .send({ model: 'claude-3-7-sonnet', max_tokens: 512, messages: [{ role: 'user', content: 'Review my resume' }] });

    assert.equal(blocking.status, 200);
    assert.equal(blocking.body.type, 'message');
    assert.equal(blocking.body.role, 'assistant');
    assert.equal(blocking.body.content[0].type, 'text');
    assert.equal(blocking.body.content[0].text, 'Anthropic blocking body');
    assert.equal(blocking.body.usage.input_tokens, 8);
    assert.equal(blocking.body.stop_reason, 'end_turn');

    serveStream = true;
    const streamed = await request(app)
      .post('/v1/messages')
      .send({ model: 'claude-3-7-sonnet', max_tokens: 512, stream: true, messages: [{ role: 'user', content: 'Stream it' }] });

    assert.equal(streamed.status, 200);
    assert.match(streamed.headers['content-type'], /text\/event-stream/);
    const events = String(streamed.text).split('\n').filter(line => line.startsWith('event: ')).map(line => line.slice(7).trim());
    assert.equal(events[0], 'message_start');
    assert.ok(events.includes('content_block_delta'));
    assert.ok(events.includes('message_stop'));
    assert.ok(String(streamed.text).includes('"text_delta"'));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    clearFreeLlmConfigCache();
  }
});

test('FreeLLMAPI: POST /v1/search exposes Tavily results with the platform key', async () => {
  const request = require('supertest');
  const { clearFreeLlmConfigCache } = require('../services/freellmConfig');
  const app = require('../index');

  process.env.TAVILY_API_KEY = 'tvly-http-key-0001';
  process.env.FREELMAPI_API_KEYS = 'ime365-platform-key';
  clearFreeLlmConfigCache();
  freellm.resetCooldowns();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith('/search'), 'search must hit the engine /search endpoint');
    return jsonResponse({
      answer: 'Use the STAR method.',
      results: [{ title: 'STAR method guide', url: 'https://example.com/star', content: 'Situation, Task, Action, Result' }],
    });
  };

  try {
    const res = await request(app)
      .post('/v1/search')
      .set('Authorization', 'Bearer ime365-platform-key')
      .send({ query: 'star method interview', max_results: 3 });

    assert.equal(res.status, 200);
    assert.equal(res.body.object, 'search.result');
    assert.equal(res.body.provider, 'tavily');
    assert.equal(res.body.answer, 'Use the STAR method.');
    assert.equal(res.body.results[0].url, 'https://example.com/star');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TAVILY_API_KEY;
    delete process.env.FREELMAPI_API_KEYS;
    clearFreeLlmConfigCache();
  }
});

test('FreeLLMAPI: transparent 429 failover through the public HTTP surface', async () => {
  const request = require('supertest');
  const { clearFreeLlmConfigCache } = require('../services/freellmConfig');
  const app = require('../index');

  process.env.GROQ_API_KEY = 'gsk-failover-0001';
  process.env.CEREBRAS_API_KEY = 'csk-failover-0002';
  clearFreeLlmConfigCache();
  const { getMetricsPersistence } = require('../freellmapi/services/persistence');
  getMetricsPersistence().reset();
  freellm.resetCooldowns();
  freellm.clearCache();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return jsonResponse({ data: [{ id: 'llama-3.3-70b-versatile' }] });
    if (String(url).includes('groq.com')) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: { message: 'Rate limit reached' } }),
      };
    }
    return jsonResponse(completionPayload('Cerebras served this transparently'));
  };

  try {
    const res = await request(app)
      .post('/v1/chat/completions')
      .send({ messages: [{ role: 'user', content: 'fail over' }] });

    assert.equal(res.status, 200);
    assert.equal(res.body.choices[0].message.content, 'Cerebras served this transparently');
    assert.equal(res.body._freellmapi.provider, 'cerebras');
    assert.equal(res.body._freellmapi.fallbacks.length, 1);
    assert.equal(res.body._freellmapi.fallbacks[0].provider, 'groq');
    assert.equal(res.body._freellmapi.fallbacks[0].status, 429);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    clearFreeLlmConfigCache();
  }
});
