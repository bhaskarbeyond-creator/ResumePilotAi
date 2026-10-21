'use strict';

/**
 * FreeLLMAPI `/v1/*` gateway — HTTP contract integration tests.
 *
 * The engine unit suite proves the router/compression/search logic in
 * isolation. This suite proves the thing clients actually see: the mount in
 * `backend/index.js`, bearer authentication, OpenAI and Anthropic wire shapes,
 * real `text/event-stream` streaming, and the search/chat isolation boundary.
 *
 * Every upstream provider call is intercepted with a fake `global.fetch`; no
 * network egress, no credentials, and no port binding.
 */

process.env.NODE_ENV = 'test';
// Deterministic, dependency-free settings store for the config loader.
process.env.IN_MEMORY_REPOSITORY = '1';
process.env.FREELMAPI_METRICS_DB = ':memory:';
// The gateway must reject callers when keys are configured; this is the key.
process.env.FREELMAPI_API_KEYS = 'v1-platform-key';
// Exactly one chat provider and one search provider exist for these tests.
process.env.GROQ_API_KEY = 'groq-test-key-a';
process.env.TAVILY_API_KEY = 'tavily-test-key';
for (const variable of [
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'NVIDIA_API_KEY',
  'EXA_API_KEY', 'FIRECRAWL_API_KEY', 'LINKUP_API_KEY', 'PARALLEL_API_KEY',
  'SERPSEARCH_API_KEY', 'IME365_V1_API_KEYS',
]) {
  delete process.env[variable];
}

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setTokenVerifierForTests } = require('../security/auth');

setTokenVerifierForTests(async token => {
  if (token === 'firebase-user-token') {
    return { uid: 'v1-user-1', email: 'v1@example.com', email_verified: true, role: 'USER', auth_time: Math.floor(Date.now() / 1000) };
  }
  throw new Error('invalid token');
});

const app = require('../index');
const freellm = require('../freellmapi');
const { clearFreeLlmConfigCache } = require('../services/freellmConfig');

const PLATFORM_KEY = 'v1-platform-key';
const bearer = key => ({ Authorization: `Bearer ${key}` });

const JSON_HEADERS = { 'content-type': 'application/json' };

function openAiCompletion({ content = 'Hello from the fake provider.', finishReason = 'stop', toolCalls } = {}) {
  return {
    id: 'chatcmpl-fake',
    object: 'chat.completion',
    created: 1_700_000_000,
    model: 'llama-3.3-70b-versatile',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: finishReason,
    }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  };
}

/** A minimal but protocol-accurate OpenAI SSE stream. */
function openAiSseBody(deltas = ['Hel', 'lo'], { toolCall = null } = {}) {
  const chunk = delta => `data: ${JSON.stringify({
    id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1_700_000_000,
    model: 'llama-3.3-70b-versatile', choices: [{ index: 0, delta, finish_reason: null }],
  })}\n\n`;
  let body = chunk({ role: 'assistant', content: '' });
  for (const delta of deltas) body += chunk({ content: delta });
  if (toolCall) {
    body += chunk({
      tool_calls: [{
        index: 0,
        id: toolCall.id || 'call_fake_1',
        type: 'function',
        function: { name: toolCall.name || 'get_weather', arguments: toolCall.arguments || '{"city":"Hyderabad"}' },
      }],
    });
  }
  body += `data: ${JSON.stringify({
    id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1_700_000_000,
    model: 'llama-3.3-70b-versatile',
    choices: [{ index: 0, delta: {}, finish_reason: toolCall ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
  })}\n\n`;
  body += 'data: [DONE]\n\n';
  return body;
}

/** Install a provider stub and restore the real fetch afterwards. */
function stubFetch(handler) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      headers: options.headers || {},
      body: (() => { try { return JSON.parse(options.body); } catch { return options.body; } })(),
    });
    return handler({ url: String(url), options, calls });
  };
  return {
    calls,
    restore() { global.fetch = original; },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function sseResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

/** Parse a buffered SSE body into its `data:` payloads (ignoring `event:` lines). */
function sseDataEvents(text) {
  return String(text)
    .split('\n\n')
    .map(block => block.split('\n').filter(line => line.startsWith('data:')))
    .map(lines => lines.map(line => line.slice(5).trim()).join(''))
    .filter(Boolean);
}

function completionCalls(calls) {
  return calls.filter(call => call.url.endsWith('/chat/completions'));
}

function sseNamedEvents(text) {
  return String(text)
    .split('\n\n')
    .map(block => {
      const lines = block.split('\n');
      const name = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
      const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
      if (!name && !data) return null;
      return { event: name || null, data: data || null };
    })
    .filter(Boolean);
}

test.beforeEach(() => {
  freellm.clearCache();
  freellm.resetCooldowns();
  clearFreeLlmConfigCache();
  process.env.FREELMAPI_API_KEYS = PLATFORM_KEY;
  process.env.GROQ_API_KEY = 'groq-test-key-a';
  process.env.TAVILY_API_KEY = 'tavily-test-key';
});

// ─── Discovery ──────────────────────────────────────────────────────────────

test('GET /v1/models advertises every provider with honest capability counts', async () => {
  const response = await request(app).get('/v1/models').expect(200);
  assert.equal(response.body.object, 'list');
  assert.equal(response.body.data.length, 74);
  assert.equal(response.body._freellmapi.chat_providers, 67);
  assert.equal(response.body._freellmapi.search_providers, 6);
  assert.equal(response.body._freellmapi.media_providers, 1);
  assert.equal(response.body._freellmapi.streaming, true);
  assert.ok(response.body._freellmapi.compression_engines.includes('dedup'));
  const groq = response.body.data.find(model => model.id === 'groq');
  assert.ok(groq, 'groq must be advertised');
  assert.equal(groq.object, 'model');
  assert.equal(groq.owned_by, 'groq');
  // Search/media platforms must never masquerade as chat models.
  const tavily = response.body.data.find(model => model.id === 'tavily');
  assert.equal(tavily.type, 'search');
});

test('GET /v1/status reports engine capabilities without leaking credentials', async () => {
  const response = await request(app).get('/v1/status').expect(200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.version, freellm.ENGINE_VERSION);
  assert.equal(response.body.capabilities.sseStreaming, true);
  assert.equal(response.body.capabilities.multiKeyPools, true);
  assert.equal(response.body.capabilities.toolCallRescue, true);
  assert.equal(response.body.totalProvidersCount, 74);
  assert.doesNotMatch(response.text, /groq-test-key-a|tavily-test-key|v1-platform-key/);
});

// ─── Authentication ─────────────────────────────────────────────────────────

test('POST /v1/chat/completions fails closed without a bearer token', async () => {
  const response = await request(app)
    .post('/v1/chat/completions')
    .send({ messages: [{ role: 'user', content: 'hi' }] })
    .expect(401);
  assert.equal(response.body.error.code, 'missing_api_key');
  assert.equal(response.body.error.type, 'invalid_request_error');
});

test('POST /v1/chat/completions rejects an unknown bearer token', async () => {
  const response = await request(app)
    .post('/v1/chat/completions')
    .set(bearer('not-a-real-key'))
    .send({ messages: [{ role: 'user', content: 'hi' }] })
    .expect(401);
  assert.equal(response.body.error.code, 'invalid_api_key');
});

test('POST /v1/chat/completions rejects an empty messages array', async () => {
  const response = await request(app)
    .post('/v1/chat/completions')
    .set(bearer(PLATFORM_KEY))
    .send({ messages: [] })
    .expect(400);
  assert.equal(response.body.error.code, 'invalid_messages');
});

test('a verified Firebase identity is an accepted /v1 principal', async () => {
  const stub = stubFetch(() => jsonResponse(openAiCompletion({ content: 'Firebase identity accepted.' })));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer('firebase-user-token'))
      .send({ messages: [{ role: 'user', content: 'who am i' }] })
      .expect(200);
    assert.equal(response.body.choices[0].message.content, 'Firebase identity accepted.');
  } finally {
    stub.restore();
  }
});

// ─── OpenAI-compatible completions ──────────────────────────────────────────

test('POST /v1/chat/completions returns the OpenAI envelope plus routing metadata', async () => {
  const stub = stubFetch(() => jsonResponse(openAiCompletion()));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({
        model: 'auto',
        messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
        temperature: 0.2,
        max_tokens: 64,
      })
      .expect(200);

    assert.equal(response.body.object, 'chat.completion');
    assert.match(response.body.id, /^chatcmpl-/);
    assert.equal(response.body.choices[0].message.role, 'assistant');
    assert.equal(response.body.choices[0].message.content, 'Hello from the fake provider.');
    assert.equal(response.body.choices[0].finish_reason, 'stop');
    assert.equal(response.body.usage.prompt_tokens, 11);
    assert.equal(response.body.usage.completion_tokens, 7);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body._freellmapi.provider, 'groq');
    assert.equal(response.body._freellmapi.actual_model, 'llama-3.3-70b-versatile');

    // The provider really received an OpenAI-shaped request with our key.
    // (The router may first probe /models for dynamic discovery, so only the
    // completion call itself is inspected.)
    const completions = completionCalls(stub.calls);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.match(String(completions[0].headers.Authorization || completions[0].headers.authorization), /^Bearer groq-test-key-a$/);
    assert.equal(completions[0].body.messages[0].content, 'Say hello in one short sentence.');
    assert.equal(completions[0].body.stream, undefined);
    assert.doesNotMatch(response.text, /groq-test-key-a/);
  } finally {
    stub.restore();
  }
});

test('the platform key pool rotates across requests and never repeats a key in one call', async () => {
  process.env.GROQ_API_KEY = 'groq-key-one, groq-key-two';
  clearFreeLlmConfigCache();
  freellm.clearCache();
  const stub = stubFetch(() => jsonResponse(openAiCompletion()));
  try {
    const prompts = ['first distinct prompt', 'second distinct prompt'];
    for (const prompt of prompts) {
      await request(app)
        .post('/v1/chat/completions')
        .set(bearer(PLATFORM_KEY))
        .send({ messages: [{ role: 'user', content: prompt }] })
        .expect(200);
    }
    const completions = completionCalls(stub.calls);
    assert.equal(completions.length, 2, 'both calls must reach the provider (no cache collision)');
    const used = completions.map(call => call.headers.Authorization || call.headers.authorization);
    assert.equal(new Set(used).size, 2, `round-robin must rotate keys, used ${JSON.stringify(used)}`);
    assert.deepEqual(new Set(used), new Set(['Bearer groq-key-one', 'Bearer groq-key-two']));
  } finally {
    stub.restore();
  }
});

test('a named but unconfigured provider returns 503 PROVIDER_NOT_CONFIGURED', async () => {
  const stub = stubFetch(() => jsonResponse(openAiCompletion()));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({ model: 'openai', messages: [{ role: 'user', content: 'hi' }] })
      .expect(503);
    assert.equal(response.body.error.code, 'PROVIDER_NOT_CONFIGURED');
    assert.equal(stub.calls.length, 0, 'an unconfigured provider must not be called');
  } finally {
    stub.restore();
  }
});

test('upstream failures surface as an OpenAI-shaped error, never as a stack trace', async () => {
  const stub = stubFetch(() => jsonResponse({ error: { message: 'invalid api key' } }, 401));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({ messages: [{ role: 'user', content: 'trigger failure' }] });
    assert.ok([401, 502, 503].includes(response.status), `unexpected status ${response.status}`);
    assert.ok(response.body.error, 'must use the OpenAI error envelope');
    assert.equal(typeof response.body.error.message, 'string');
    assert.doesNotMatch(response.text, /groq-test-key-a/);
  } finally {
    stub.restore();
  }
});

test('POST /v1/chat/completions streams real SSE deltas and terminates with [DONE]', async () => {
  const stub = stubFetch(() => sseResponse(openAiSseBody(['Hel', 'lo ', 'world'])));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({
        messages: [{ role: 'user', content: 'stream a greeting' }],
        stream: true,
        stream_options: { include_usage: true },
      })
      .expect(200);

    assert.match(String(response.headers['content-type']), /^text\/event-stream/);
    assert.match(String(response.headers['cache-control']), /no-cache/);
    assert.equal(response.headers['x-accel-buffering'], 'no');

    const data = sseDataEvents(response.text);
    assert.equal(data[data.length - 1], '[DONE]');
    const chunks = data.slice(0, -1).map(entry => JSON.parse(entry));
    assert.ok(chunks.every(chunk => chunk.object === 'chat.completion.chunk'));

    const text = chunks
      .flatMap(chunk => chunk.choices || [])
      .map(choice => choice.delta?.content || '')
      .join('');
    assert.equal(text, 'Hello world');

    const finish = chunks.flatMap(chunk => chunk.choices || []).find(choice => choice.finish_reason);
    assert.equal(finish.finish_reason, 'stop');

    const usageChunk = chunks.find(chunk => chunk.usage);
    assert.equal(usageChunk.usage.total_tokens, 18);
    assert.equal(completionCalls(stub.calls)[0].body.stream, true, 'stream:true must be forwarded upstream');
  } finally {
    stub.restore();
  }
});

test('streamed tool calls are emitted as OpenAI function deltas', async () => {
  const stub = stubFetch(() => sseResponse(openAiSseBody([], {
    toolCall: { id: 'call_weather_1', name: 'get_weather', arguments: '{"city":"Hyderabad"}' },
  })));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({
        messages: [{ role: 'user', content: 'What is the weather in Hyderabad?' }],
        stream: true,
        tools: [{
          type: 'function',
          function: { name: 'get_weather', description: 'weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
        }],
      })
      .expect(200);

    const chunks = sseDataEvents(response.text)
      .filter(entry => entry !== '[DONE]')
      .map(entry => JSON.parse(entry));
    const toolDelta = chunks
      .flatMap(chunk => chunk.choices || [])
      .flatMap(choice => choice.delta?.tool_calls || [])[0];
    assert.ok(toolDelta, 'a tool_calls delta must be streamed');
    assert.equal(toolDelta.function.name, 'get_weather');
    assert.equal(toolDelta.function.arguments, '{"city":"Hyderabad"}');
    const finish = chunks.flatMap(chunk => chunk.choices || []).find(choice => choice.finish_reason);
    assert.equal(finish.finish_reason, 'tool_calls');

    // Tools are forwarded to the provider in OpenAI shape.
    assert.equal(completionCalls(stub.calls)[0].body.tools[0].function.name, 'get_weather');
  } finally {
    stub.restore();
  }
});

test('repeated context is deduplicated before it reaches the provider', async () => {
  const nonce = `run-${Date.now()}`;
  const block = [
    `Pasted job description for ${nonce}:`,
    'We are hiring a senior backend engineer to own the billing platform.',
    'You will design idempotent payment pipelines, own the outbox worker,',
    'and partner with the data team on reconciliation dashboards.',
    'This block is intentionally long so the lossless dedup engine engages.',
  ].join('\n');

  const stub = stubFetch(() => jsonResponse(openAiCompletion({ content: 'Summarised.' })));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({
        // The engine freezes the most recent turns (recency wins), so the
        // duplicate pair sits ahead of them: message 1 survives, message 0 is
        // replaced by a pointer — the model can still read the original.
        messages: [
          { role: 'user', content: block },
          { role: 'user', content: block },
          { role: 'assistant', content: 'Noted.' },
          { role: 'user', content: 'Summarise the role in one line.' },
        ],
      })
      .expect(200);

    const compression = response.body._freellmapi.compression;
    assert.ok(compression, 'compression stats must be reported');
    assert.equal(compression.enabled, true);
    assert.ok(compression.tokensSaved > 0, `expected savings, got ${JSON.stringify(compression)}`);
    assert.ok(compression.beforeChars > compression.afterChars);

    const upstreamMessages = completionCalls(stub.calls)[0].body.messages;
    const stubbed = upstreamMessages.filter(message => /not repeated/.test(String(message.content)));
    assert.equal(stubbed.length, 1, 'exactly one duplicate block must be replaced');
    assert.match(String(stubbed[0].content), /same content as message 2/);
    assert.equal(upstreamMessages[1].content, block, 'the retained copy must stay verbatim');
    // The final instruction always survives untouched.
    assert.equal(upstreamMessages[3].content, 'Summarise the role in one line.');
  } finally {
    stub.restore();
  }
});

test('/api/v1 is not aliased: the shared /api auth stage is Firebase-only', async () => {
  const stub = stubFetch(() => jsonResponse(openAiCompletion()));
  try {
    const response = await request(app)
      .post('/api/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({ messages: [{ role: 'user', content: 'alias check' }] });
    // Either a hard 401 (auth stage) or 404 (no route) is honest; a 200 would
    // mean an undocumented, platform-key-incompatible surface was shipped.
    assert.ok([401, 404].includes(response.status), `unexpected status ${response.status}`);
    assert.equal(completionCalls(stub.calls).length, 0);
  } finally {
    stub.restore();
  }
});


// ─── Anthropic Messages ─────────────────────────────────────────────────────

test('POST /v1/messages returns an Anthropic message envelope', async () => {
  const stub = stubFetch(() => jsonResponse(openAiCompletion({ content: 'Anthropic says hello.' })));
  try {
    const response = await request(app)
      .post('/v1/messages')
      .set(bearer(PLATFORM_KEY))
      .send({
        model: 'claude-3-7-sonnet',
        max_tokens: 128,
        system: 'You are terse.',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Greet me.' }] }],
      })
      .expect(200);

    assert.equal(response.body.type, 'message');
    assert.equal(response.body.role, 'assistant');
    assert.equal(response.body.content[0].type, 'text');
    assert.equal(response.body.content[0].text, 'Anthropic says hello.');
    assert.equal(response.body.stop_reason, 'end_turn');
    assert.equal(response.body.usage.input_tokens, 11);
    assert.equal(response.body.usage.output_tokens, 7);

    // Anthropic system blocks become a system message upstream.
    const upstream = completionCalls(stub.calls)[0].body.messages;
    assert.equal(upstream[0].role, 'system');
    assert.match(JSON.stringify(upstream), /You are terse\./);
  } finally {
    stub.restore();
  }
});

test('POST /v1/messages rejects a missing messages array in Anthropic error shape', async () => {
  const response = await request(app)
    .post('/v1/messages')
    .set(bearer(PLATFORM_KEY))
    .send({ model: 'claude-3-7-sonnet' })
    .expect(400);
  assert.equal(response.body.type, 'error');
  assert.equal(response.body.error.type, 'invalid_request_error');
});

test('POST /v1/messages streams the Anthropic event sequence', async () => {
  const stub = stubFetch(() => sseResponse(openAiSseBody(['Hola', ' mundo'])));
  try {
    const response = await request(app)
      .post('/v1/messages')
      .set(bearer(PLATFORM_KEY))
      .send({
        model: 'claude-3-7-sonnet',
        max_tokens: 64,
        stream: true,
        messages: [{ role: 'user', content: 'Say hola' }],
      })
      .expect(200);

    assert.match(String(response.headers['content-type']), /^text\/event-stream/);
    const events = sseNamedEvents(response.text);
    const names = events.map(entry => entry.event);
    assert.equal(names[0], 'message_start');
    assert.ok(names.includes('content_block_start'), `missing content_block_start: ${names.join(',')}`);
    assert.ok(names.includes('content_block_delta'), `missing content_block_delta: ${names.join(',')}`);
    assert.ok(names.includes('content_block_stop'), `missing content_block_stop: ${names.join(',')}`);
    assert.ok(names.includes('message_delta'), `missing message_delta: ${names.join(',')}`);
    assert.equal(names[names.length - 1], 'message_stop');
    // Telemetry is internal and must never leak into the Anthropic wire.
    assert.ok(!names.includes('_meta'), 'internal _meta event leaked to the client');

    const deltas = events
      .filter(entry => entry.event === 'content_block_delta')
      .map(entry => JSON.parse(entry.data));
    assert.equal(deltas.map(delta => delta.delta.text).join(''), 'Hola mundo');
  } finally {
    stub.restore();
  }
});

// ─── Agent search ───────────────────────────────────────────────────────────

test('POST /v1/search returns normalised Tavily results', async () => {
  const stub = stubFetch(() => jsonResponse({
    answer: 'Hyderabad is the capital of Telangana.',
    results: [
      { title: 'Hyderabad &amp; Telangana', url: 'https://example.com/hyd', content: 'Hyderabad is the capital city of Telangana state.', score: 0.93 },
      { title: 'Charminar', url: 'https://example.com/charminar', content: 'A 1591 mosque in Hyderabad.' },
    ],
  }));
  try {
    const response = await request(app)
      .post('/v1/search')
      .set(bearer(PLATFORM_KEY))
      .send({ query: 'capital of Telangana', max_results: 3, include_answer: true })
      .expect(200);

    assert.equal(response.body.object, 'search.result');
    assert.equal(response.body.provider, 'tavily');
    assert.equal(response.body.query, 'capital of Telangana');
    assert.match(response.body.answer, /capital of Telangana/);
    assert.equal(response.body.results.length, 2);
    assert.equal(response.body.results[0].title, 'Hyderabad & Telangana');
    assert.equal(response.body.results[0].score, 0.93);
    assert.equal(typeof response.body.latency_ms, 'number');

    assert.equal(stub.calls[0].url, 'https://api.tavily.com/search');
    assert.match(String(stub.calls[0].headers.Authorization || stub.calls[0].headers.authorization), /^Bearer tavily-test-key$/);
    assert.equal(stub.calls[0].body.query, 'capital of Telangana');
    assert.equal(stub.calls[0].body.include_answer, true);
  } finally {
    stub.restore();
  }
});

test('POST /v1/search requires a query', async () => {
  const response = await request(app)
    .post('/v1/search')
    .set(bearer(PLATFORM_KEY))
    .send({ max_results: 3 })
    .expect(400);
  assert.equal(response.body.error.code, 'invalid_search_query');
});

test('POST /v1/search returns 503 NO_SEARCH_PROVIDER when no engine is configured', async () => {
  delete process.env.TAVILY_API_KEY;
  clearFreeLlmConfigCache();
  const stub = stubFetch(() => jsonResponse({ results: [] }));
  try {
    const response = await request(app)
      .post('/v1/search')
      .set(bearer(PLATFORM_KEY))
      .send({ query: 'anything' })
      .expect(503);
    assert.equal(response.body.error.code, 'NO_SEARCH_PROVIDER');
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
    process.env.TAVILY_API_KEY = 'tavily-test-key';
    clearFreeLlmConfigCache();
  }
});

test('search and media providers are never candidates for chat completions', async () => {
  // Remove every chat credential. Keyless gateways (e.g. Kilo) remain legal
  // chat candidates by design; the search engine must never be one.
  delete process.env.GROQ_API_KEY;
  clearFreeLlmConfigCache();
  freellm.clearCache();
  const stub = stubFetch(() => jsonResponse(openAiCompletion({ content: 'keyless gateway reply' })));
  try {
    const response = await request(app)
      .post('/v1/chat/completions')
      .set(bearer(PLATFORM_KEY))
      .send({ messages: [{ role: 'user', content: 'no chat provider configured' }] });

    assert.equal(response.status, 200, JSON.stringify(response.body).slice(0, 300));
    assert.notEqual(response.body._freellmapi.provider, 'tavily');
    const tavilyCalls = stub.calls.filter(call => /tavily/.test(call.url));
    assert.equal(tavilyCalls.length, 0, 'tavily must never receive a chat completion');

    const chatIds = freellm.getChatProviders().map(provider => provider.id);
    assert.ok(!chatIds.includes('tavily'), 'tavily must not be chat-capable');
    assert.ok(!chatIds.includes('exa'), 'exa must not be chat-capable');
    assert.ok(chatIds.includes('kilo'), 'keyless gateways stay available');
    assert.equal(chatIds.length, 67);
  } finally {
    stub.restore();
    process.env.GROQ_API_KEY = 'groq-test-key-a';
    clearFreeLlmConfigCache();
  }
});
