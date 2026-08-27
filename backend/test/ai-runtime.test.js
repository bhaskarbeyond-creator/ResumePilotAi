const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLegacyPrompt,
  buildResumeParsingPrompt,
  executeContentOperation,
  executeResumeParsing,
  loadProviderConfiguration,
  parseAiResponse,
  providerOrder,
  requestProvider,
} = require('../services/aiRuntime');

function fakeDb({ secrets = {}, publicAi = {}, legacyAi = {} } = {}) {
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name === 'settings' && id === 'ai_providers') return { exists: true, data: () => secrets };
              if (name === 'data' && id === 'public_config') return { exists: true, data: () => ({ ai: publicAi }) };
              if (name === 'data' && id === 'system_settings') return { exists: true, data: () => ({ ai: legacyAi }) };
              return { exists: false, data: () => ({}) };
            },
          };
        },
      };
    },
  };
}


// MySQL seed helper: seeds the authoritative AI settings store.
const { getPool } = require('../database/mysql');
async function seedRuntimeSettings({ secrets = {}, publicAi = {}, legacyAi = {} } = {}) {
  const pool = getPool();
  await pool.query("DELETE FROM system_settings WHERE category IN ('public_config','ai_providers','system_settings')");
  if (Object.keys(secrets).length) {
    await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('ai_providers', ?, 1) ON DUPLICATE KEY UPDATE data = VALUES(data), revision = 1", [JSON.stringify(secrets)]);
  }
  if (Object.keys(publicAi).length) {
    await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('public_config', ?, 1) ON DUPLICATE KEY UPDATE data = VALUES(data), revision = 1", [JSON.stringify({ ai: publicAi })]);
  }
  if (Object.keys(legacyAi).length) {
    await pool.query("INSERT INTO system_settings (category, data, revision) VALUES ('system_settings', ?, 1) ON DUPLICATE KEY UPDATE data = VALUES(data), revision = 1", [JSON.stringify({ ai: legacyAi })]);
  }
  return null;
}

const okJson = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('restored prompts preserve old contextual product instructions and response contracts', () => {
  const work = buildLegacyPrompt('generate-work-description', {
    jobTitle: 'Platform Engineer', employer: 'Acme', city: 'Vijayawada',
    existingText: 'Migrated the billing API to containers', focusTone: 'Technical depth', language: 'en',
  }, { sessionId: 'fixture' }).prompt;
  assert.match(work, /Fortune 500 Senior Executive Resume Writer/);
  assert.match(work, /Migrated the billing API to containers/);
  assert.match(work, /Focus Area: Technical depth/);
  assert.match(work, /STRICT FACTUAL MANDATE/);
  assert.match(work, /"suggestions"/);

  const summary = buildLegacyPrompt('generate-summary', {
    name: 'Asha Rao', jobTitle: 'Engineer', experience: '6+ years',
    workHistory: 'Engineer at Acme', education: 'M.Tech', skills: ['React', 'Node.js'],
    certifications: ['AWS'], projects: 'Payments modernization', language: 'en',
  }, { sessionId: 'fixture' }).prompt;
  for (const context of ['Asha Rao', '6+ years', 'Engineer at Acme', 'M.Tech', 'React, Node.js', 'AWS', 'Payments modernization']) assert.match(summary, new RegExp(context.replace(/[+.]/g, '\\$&')));
  assert.match(summary, /3 complete, rich sentences/);
  assert.match(summary, /45-65 words total/);
  assert.match(summary, /RESUME SUMMARY, NOT a cover letter/);

  const skills = buildLegacyPrompt('generate-skills', {
    occupation: 'Engineer', workHistory: 'APIs', education: 'M.Tech', projects: 'Compiler', existingSkills: ['JavaScript'],
  }, { sessionId: 'fixture' }).prompt;
  assert.match(skills, /12 high-demand/);
  assert.match(skills, /Existing Skills Already Added: JavaScript/);

  const autocomplete = buildLegacyPrompt('autocomplete', { type: 'certificationIssuer', query: 'Ama' }, { sessionId: 'fixture' }).prompt;
  assert.match(autocomplete, /official certification issuing organizations/);
  assert.match(autocomplete, /"Ama"/);
});

test('response normalization preserves UI contracts across markdown, aliases, and cleanup', () => {
  assert.deepEqual(parseAiResponse('generate-work-description', '```json\n{"bullets":[{"text":"Spearheaded migration [X%]"},"Built APIs"]}\n```'), {
    suggestions: ['Led migration', 'Built APIs'],
  });
  assert.deepEqual(parseAiResponse('generate-summary', '{"description":"Engineer with distributed systems experience."}'), {
    summary: 'Engineer with distributed systems experience.',
  });
  assert.deepEqual(parseAiResponse('generate-skills', '{"keywords":["React (e.g. React.js)",{"skill":"Docker","type":"recommended"}]}'), {
    skills: [
      { name: 'React', category: 'mandatory' },
      { name: 'Docker', category: 'recommended' },
    ],
  });
  assert.deepEqual(parseAiResponse('generate-certifications', '{"certs":[{"name":"AWS Certified Developer","organization":"Amazon Web Services"}]}'), {
    certifications: [{ title: 'AWS Certified Developer', issuer: 'Amazon Web Services', category: 'mandatory' }],
  });
  assert.deepEqual(parseAiResponse('enhance-single-bullet', 'Leveraged automation to reduce deployment time.'), {
    enhancedBullet: 'Used automation to reduce deployment time.',
  });
  assert.deepEqual(parseAiResponse('generate-summary', '{"summary":"<script>alert(1)</script><b>Secure engineer</b>"}'), {
    summary: 'Secure engineer',
  });
});

test('grammar responses are deterministically bounded and invalid indexes are rejected', () => {
  const text = 'Teh company is growing. ';
  const raw = JSON.stringify({
    hasErrors: true,
    corrections: [
      { original: 'Teh', suggestion: 'The', type: 'spelling', explanation: 'Spelling', startIndex: 0, endIndex: 3 },
      { original: 'Nope', suggestion: 'Never', type: 'grammar', explanation: 'Stale index', startIndex: 99, endIndex: 103 },
      { original: 'Teh', suggestion: 'The', type: 'spelling', explanation: 'Duplicate range', startIndex: 0, endIndex: 3 },
      { original: 'growing. ', suggestion: 'growing.', type: 'style', explanation: 'Trailing space', startIndex: 15, endIndex: 24 },
      { original: 'bad', suggestion: 'evil', type: 'injection', explanation: 'Bad type', startIndex: 0, endIndex: 3 },
    ],
    overallSuggestion: 'Review the issue.'
  });
  assert.deepEqual(parseAiResponse('check-grammar', raw, { sourceText: text }), {
    hasErrors: true,
    corrections: [
      { original: 'Teh', suggestion: 'The', type: 'spelling', explanation: 'Spelling', startIndex: 0, endIndex: 3 },
      { original: 'growing. ', suggestion: 'growing.', type: 'style', explanation: 'Trailing space', startIndex: 15, endIndex: 24 },
    ],
    overallSuggestion: 'Review the issue.'
  });
  assert.deepEqual(parseAiResponse('check-grammar', '{"hasErrors":false,"corrections":[],"overallSuggestion":"All good."}', { sourceText: text }), {
    hasErrors: false, corrections: [], overallSuggestion: 'All good.'
  });
});

test('server configuration preserves primary provider, model, controls, and fallback order without exposing keys', async () => {
  await seedRuntimeSettings({
    secrets: {
      nvidia: { apiKey: 'nvidia-test-key-12345', model: 'meta/custom-model' },
      gemini: { apiKey: 'gemini-test-key-12345' },
      openai: { apiKey: 'openai-test-key-12345' },
    },
    publicAi: { provider: 'nvidia', enableNvidia: true, enableGemini: true, enableOpenai: false, enableFallback: true, temperature: 0.4, maxTokens: 1337 },
  });
  const configuration = await loadProviderConfiguration(null, {});
  assert.equal(configuration.primary, 'nvidia');
  assert.equal(configuration.providers.nvidia.model, 'meta/custom-model');
  assert.equal(configuration.temperature, 0.4);
  assert.equal(configuration.maxTokens, 1337);
  assert.deepEqual(providerOrder(configuration), ['nvidia', 'gemini']);
  assert.doesNotMatch(JSON.stringify({ ...configuration, providers: Object.fromEntries(Object.entries(configuration.providers).map(([key, value]) => [key, { enabled: value.enabled, model: value.model }])) }), /test-key/);
});

test('provider configuration cache avoids cross-request mutation of generation controls', async () => {
  await seedRuntimeSettings({ secrets: { gemini: { apiKey: 'gemini-test-key-12345' } }, publicAi: { temperature: 0.4, maxTokens: 1337 } });
  const first = await loadProviderConfiguration(null, {});
  first.temperature = 0.1;
  first.maxTokens = 4096;
  const second = await loadProviderConfiguration(null, {});
  assert.equal(second.temperature, 0.4);
  assert.equal(second.maxTokens, 1337);
});

test('legacy server-side provider settings remain migration-compatible without returning secrets to browsers', async () => {
  await seedRuntimeSettings({
    legacyAi: { provider: 'groq', groqApiKey: 'legacy-groq-key-12345', groqModel: 'legacy/model', enableGroq: true },
  });
  const configuration = await loadProviderConfiguration(null, {});
  assert.equal(configuration.primary, 'groq');
  assert.equal(configuration.providers.groq.enabled, true);
  assert.equal(configuration.providers.groq.model, 'legacy/model');
});

test('provider failure falls back in configured order and returns the original normalized contract', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options: JSON.parse(options.body) });
    if (url.includes('nvidia.com')) return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 });
    return okJson({ candidates: [{ content: { parts: [{ text: '```json\n{"summary":"Platform engineer focused on reliable APIs."}\n```' }] } }] });
  };
  await seedRuntimeSettings({
    secrets: { nvidia: { apiKey: 'nvidia-test-key-12345' }, gemini: { apiKey: 'gemini-test-key-12345' } },
    publicAi: { provider: 'nvidia', enableFallback: true },
  });
  const result = await executeContentOperation({
    operation: 'generate-summary', payload: { name: 'Asha', jobTitle: 'Platform Engineer', workHistory: 'Built APIs' },
    db: null, environment: {}, fetchImpl, requestId: 'fixture',
  });
  assert.equal(result.provider, 'gemini');
  assert.deepEqual(result.data, { summary: 'Platform engineer focused on reliable APIs.' });
  assert.equal(calls.length, 2);
  assert.match(calls[0].options.messages[0].content, /Asha/);
  assert.match(calls[1].options.contents[0].parts[0].text, /Built APIs/);
});

test('disabled fallback fails after the selected provider and never spends against another provider', async () => {
  let calls = 0;
  await seedRuntimeSettings({
    secrets: { nvidia: { apiKey: 'nvidia-test-key-12345' }, gemini: { apiKey: 'gemini-test-key-12345' } },
    publicAi: { provider: 'nvidia', enableFallback: false },
  });
  const configuration = await loadProviderConfiguration(null, {});
  await assert.rejects(() => require('../services/aiRuntime').generateWithProviders({
    prompt: 'fixture', operation: 'generate-summary', configuration,
    fetchImpl: async () => { calls += 1; return new Response('{}', { status: 503 }); },
  }), error => error.code === 'AI_PROVIDER_ERROR');
  assert.equal(calls, 1);
});

test('resume extraction keeps the old schema/context and supports deterministic provider output', async () => {
  const prompt = buildResumeParsingPrompt('Asha Rao\nasha@example.com\nPlatform Engineer at Acme');
  assert.match(prompt, /Separate jobTitle and employer/);
  assert.match(prompt, /asha@example.com/);
  const result = await executeResumeParsing({
    rawText: 'Asha Rao\nasha@example.com\nPlatform Engineer at Acme',
    db: fakeDb({ secrets: { openai: { apiKey: 'openai-test-key-12345' } }, publicAi: { provider: 'openai' } }),
    environment: {},
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.temperature, 0.15);
      assert.equal(request.max_tokens, 4096);
      return okJson({ choices: [{ message: { content: '{"firstname":"Asha","lastname":"Rao","email":"asha@example.com","employments":[{"jobTitle":"Platform Engineer","employer":"Acme"}],"educations":[],"skills":[],"languages":[]}' } }] });
    },
  });
  assert.equal(result.data.firstname, 'Asha');
  assert.equal(result.data.employments[0].employer, 'Acme');
});

test('provider requests honor cancellation and bounded timeout controls', async () => {
  const controller = new AbortController();
  const promise = requestProvider('openai', { key: 'openai-test-key-12345', model: 'gpt-4o-mini' }, 'prompt', { temperature: 0.7, maxTokens: 256 }, {
    signal: controller.signal,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(promise, error => error.name === 'AbortError');
});

test('getContentOperationFallback returns deterministic role-aware fallbacks for generate-content operations', () => {
  const { getContentOperationFallback } = require('../services/aiRuntime');

  // Certifications fallback
  const certsFallback = getContentOperationFallback('generate-certifications', { jobTitle: 'Cybersecurity Analyst' });
  assert.ok(Array.isArray(certsFallback.certifications));
  assert.ok(certsFallback.certifications.length >= 4);
  assert.equal(certsFallback._source, 'fallback');
  assert.ok(certsFallback.certifications.some(c => c.title.includes('CISSP') || c.title.includes('Security+')));

  // Bullet enhancement fallback (returns original bullet unchanged)
  const bulletFallback = getContentOperationFallback('enhance-single-bullet', { bullet: 'Wrote unit tests' });
  assert.equal(bulletFallback.enhancedBullet, 'Wrote unit tests');
  assert.equal(bulletFallback._source, 'fallback');

  // Autocomplete fallback (returns empty array)
  const autoFallback = getContentOperationFallback('autocomplete', { query: 're' });
  assert.deepEqual(autoFallback.suggestions, []);
  assert.equal(autoFallback._source, 'fallback');

  // Skills fallback
  const skillsFallback = getContentOperationFallback('generate-skills', { occupation: 'Frontend Developer' });
  assert.ok(Array.isArray(skillsFallback.skills));
  assert.equal(skillsFallback._source, 'fallback');
  assert.ok(skillsFallback.skills.some(s => s.name === 'React' || s.name === 'JavaScript'));
});

test('executeContentOperation gracefully falls back on provider failure without throwing 502', async () => {
  const failingFetch = async () => new Response('{"error":"All providers down"}', { status: 503 });

  // Certifications operation returns fallback on provider failure
  const certResult = await executeContentOperation({
    operation: 'generate-certifications',
    payload: { jobTitle: 'DevOps Engineer' },
    db: fakeDb({ secrets: { gemini: { apiKey: 'test-key' } }, publicAi: { provider: 'gemini' } }),
    environment: {},
    fetchImpl: failingFetch,
    requestId: 'test-fallback-cert',
  });
  assert.equal(certResult.provider, 'fallback');
  assert.ok(Array.isArray(certResult.data.certifications));
  assert.ok(certResult.data.certifications.some(c => c.title.includes('AWS') || c.title.includes('Kubernetes')));

  // Enhance single bullet returns original bullet on provider failure
  const bulletResult = await executeContentOperation({
    operation: 'enhance-single-bullet',
    payload: { bullet: 'Managed a team of 5' },
    db: fakeDb({ secrets: { gemini: { apiKey: 'test-key' } }, publicAi: { provider: 'gemini' } }),
    environment: {},
    fetchImpl: failingFetch,
    requestId: 'test-fallback-bullet',
  });
  assert.equal(bulletResult.provider, 'fallback');
  assert.equal(bulletResult.data.enhancedBullet, 'Managed a team of 5');

  // Invalid payload still throws a 400 error (validation error is preserved)
  await assert.rejects(
    () => executeContentOperation({
      operation: 'enhance-single-bullet',
      payload: {}, // Missing required bullet field
      db: fakeDb({ secrets: { gemini: { apiKey: 'test-key' } }, publicAi: { provider: 'gemini' } }),
      environment: {},
      fetchImpl: failingFetch,
    }),
    error => error.status === 400
  );
});

